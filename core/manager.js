const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUNNERS_DIR = path.join(__dirname, '..', 'runners');
const MAX_LOG = 500;

class Manager {
    constructor() {
        this.children = new Map();
        this.logs = new Map();
        this.booted = false;
        this.restartTimers = new Map();
        this.pendingPayload = new Map();
    }

    runningLogs(type) {
        return this.logs.get(type) || [];
    }

    appendLog(type, line) {
        if (!this.logs.has(type)) this.logs.set(type, []);
        const arr = this.logs.get(type);
        const text = String(line).replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (!text) return;
        const stamp = new Date().toISOString().slice(11, 19);
        arr.push(`[${stamp}] ${text}`);
        if (arr.length > MAX_LOG) arr.splice(0, arr.length - MAX_LOG);
    }

    isRunning(type) {
        const c = this.children.get(type);
        return !!c && c.exitCode === null && !c.killed;
    }

    statusFor(type, activeIds) {
        return {
            type,
            running: this.isRunning(type),
            instances: activeIds,
        };
    }

    async recompute(instances) {
        const byType = {};
        for (const inst of instances) {
            if (!inst.enabled) continue;
            (byType[inst.type] = byType[inst.type] || []).push(inst);
        }
        const types = ['music', 'ticket', 'server', 'separator', 'bank'];
        for (const t of types) {
            const list = byType[t] || [];
            this.pendingPayload.set(t, list);
            if (list.length === 0) {
                this.stopType(t);
            } else {
                this.startType(t, list);
            }
        }
    }

    startType(type, instances) {
        const cur = this.children.get(type);
        if (cur && cur.exitCode === null && !cur.killed) {
            const payloadHash = this.payloadHash(instances);
            if (this.startedHash && this.startedHash.get(type) === payloadHash) {
                return;
            }
            this.appendLog(type, '🔄 تغيّر إعدادات النوع — إعادة تشغيل...');
            this.stopType(type);
            setTimeout(() => this.launch(type, instances), 800);
            return;
        }
        this.launch(type, instances);
    }

    payloadHash(instances) {
        return JSON.stringify(instances.map((i) => ({ id: i.id, type: i.type, config: i.config, enabled: i.enabled })));
    }

    launch(type, instances) {
        this.clearRestart(type);
        const runner = path.join(RUNNERS_DIR, type + '.js');
        if (!fs.existsSync(runner)) {
            this.appendLog(type, `⚠️ لا يوجد runner لهذا النوع: ${type}`);
            return;
        }
        const payload = Buffer.from(JSON.stringify({ instances })).toString('base64');
        const child = spawn(process.execPath, [runner], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, PLATFORM_TYPE: type, PLATFORM_PAYLOAD: payload },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.children.set(type, child);
        if (!this.startedHash) this.startedHash = new Map();
        this.startedHash.set(type, this.payloadHash(instances));

        const pipeLine = (data) => {
            String(data).split('\n').forEach((l) => this.appendLog(type, l));
        };
        child.stdout.on('data', pipeLine);
        child.stderr.on('data', pipeLine);

        this.appendLog(type, `🚀 تشغيل بوتات النوع (${type}) — ${instances.length} مثيل`);

        child.on('exit', (code, signal) => {
            if (!this.isRunning(type)) this.children.set(type, null);
            this.appendLog(type, `⛔ توقف النوع (${type}) code=${code} signal=${signal || ''}`);
            const stillNeeded = (this.pendingPayload.get(type) || []).length > 0;
            if (stillNeeded && code !== 0 && code !== null) {
                this.scheduleRestart(type, this.pendingPayload.get(type));
            }
        });
        child.on('error', (e) => {
            this.appendLog(type, `❌ فشل تشغيل العملية: ${e.message}`);
            this.scheduleRestart(type, this.pendingPayload.get(type));
        });
    }

    stopType(type) {
        this.clearRestart(type);
        const child = this.children.get(type);
        if (child) {
            try {
                child.kill('SIGTERM');
            } catch (e) { /* تجاهل */ }
            this.appendLog(type, '⏹️ إيقاف مؤكد.');
        }
        this.children.set(type, null);
    }

    scheduleRestart(type, instances) {
        this.clearRestart(type);
        const t = setTimeout(() => {
            this.appendLog(type, '🔄 إعادة تشغيل تلقائية...');
            this.startType(type, instances);
        }, 5000);
        this.restartTimers.set(type, t);
    }

    clearRestart(type) {
        const t = this.restartTimers.get(type);
        if (t) {
            clearTimeout(t);
            this.restartTimers.delete(type);
        }
    }

    shutdown() {
        for (const [, child] of this.children) {
            if (child) {
                try { child.kill('SIGTERM'); } catch (e) { /* تجاهل */ }
            }
        }
    }
}

module.exports = new Manager();