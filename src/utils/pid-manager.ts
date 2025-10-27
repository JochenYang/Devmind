import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export class PidManager {
  private pidFile: string;

  constructor(projectPath?: string) {
    // 如果提供了项目路径，使用项目级别的 PID 文件
    // 否则使用全局 PID 文件
    if (projectPath) {
      const devmindDir = join(projectPath, ".devmind");
      if (!existsSync(devmindDir)) {
        mkdirSync(devmindDir, { recursive: true });
      }
      this.pidFile = join(devmindDir, "daemon.pid");
    } else {
      const globalDir = join(homedir(), ".devmind");
      if (!existsSync(globalDir)) {
        mkdirSync(globalDir, { recursive: true });
      }
      this.pidFile = join(globalDir, "daemon.pid");
    }
  }

  /**
   * 写入 PID 到文件
   */
  writePid(pid: number): void {
    const data = {
      pid,
      startedAt: new Date().toISOString(),
      processTitle: process.title,
    };
    writeFileSync(this.pidFile, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * 读取 PID 文件
   */
  readPid(): { pid: number; startedAt: string; processTitle: string } | null {
    if (!existsSync(this.pidFile)) {
      return null;
    }

    try {
      const content = readFileSync(this.pidFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("Failed to read PID file:", error);
      return null;
    }
  }

  /**
   * 删除 PID 文件
   */
  removePid(): void {
    if (existsSync(this.pidFile)) {
      unlinkSync(this.pidFile);
    }
  }

  /**
   * 检查进程是否在运行
   */
  isProcessRunning(pid: number): boolean {
    try {
      // 发送信号 0 来检查进程是否存在（不会实际终止进程）
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取守护进程状态
   */
  getStatus(): {
    running: boolean;
    pid?: number;
    startedAt?: string;
    uptime?: string;
  } {
    const pidData = this.readPid();

    if (!pidData) {
      return { running: false };
    }

    const isRunning = this.isProcessRunning(pidData.pid);

    if (!isRunning) {
      // PID 文件存在但进程不在运行，清理 PID 文件
      this.removePid();
      return { running: false };
    }

    // 计算运行时间
    const startTime = new Date(pidData.startedAt).getTime();
    const now = Date.now();
    const uptimeMs = now - startTime;
    const uptimeMinutes = Math.floor(uptimeMs / 60000);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    let uptime: string;
    if (uptimeDays > 0) {
      uptime = `${uptimeDays}d ${uptimeHours % 24}h`;
    } else if (uptimeHours > 0) {
      uptime = `${uptimeHours}h ${uptimeMinutes % 60}m`;
    } else {
      uptime = `${uptimeMinutes}m`;
    }

    return {
      running: true,
      pid: pidData.pid,
      startedAt: pidData.startedAt,
      uptime,
    };
  }

  /**
   * 终止守护进程
   */
  killProcess(): boolean {
    const pidData = this.readPid();

    if (!pidData) {
      return false;
    }

    try {
      // 先尝试优雅终止 (SIGTERM)
      process.kill(pidData.pid, "SIGTERM");

      // 等待一下
      setTimeout(() => {
        if (this.isProcessRunning(pidData.pid)) {
          // 如果还在运行，强制终止 (SIGKILL)
          try {
            process.kill(pidData.pid, "SIGKILL");
          } catch (error) {
            // 进程可能已经终止
          }
        }
      }, 2000);

      this.removePid();
      return true;
    } catch (error) {
      console.error("Failed to kill process:", error);
      this.removePid(); // 清理 PID 文件
      return false;
    }
  }
}
