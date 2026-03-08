<div align="center">

# Termix

现代化、跨平台 SSH 终端客户端

基于 **Tauri v2** + **React** + **Rust** 构建

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[English](./README.md)

</div>

## 功能特性

- **SSH 终端** — 通过密码或密钥认证连接远程主机
- **本地终端** — 打开本地 Shell 会话，支持自定义 Shell 配置
- **SFTP 文件管理** — 双面板文件浏览器，支持拖拽上传、权限编辑、传输队列
- **密钥链** — 安全管理 SSH 私钥，加密存储
- **代码片段** — 保存常用命令，支持自动补全
- **会话日志** — 关闭标签页时自动捕获终端快照，支持只读回放
- **WebDAV 同步** — 通过加密的 WebDAV 存储跨设备同步连接和密钥链
- **主题支持** — 内置 13+ 终端主题（Tokyo Night、Dracula、Nord、Catppuccin 等）
- **跨平台** — 支持 Windows、macOS 和 Linux

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri v2](https://v2.tauri.app/) |
| 前端 | React、TypeScript、Tailwind CSS、shadcn/ui |
| 后端 | Rust、russh、sqlx (SQLite)、aes-gcm |
| 终端 | xterm.js + WebGL 渲染器 |

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- 对应平台的 Tauri [前置依赖](https://v2.tauri.app/start/prerequisites/)

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev
```

### 构建

```bash
pnpm tauri build
```

## 截图

| 主页 | 连接进度 |
|:---:|:---:|
| ![主页](./screenshots/1.png) | ![连接进度](./screenshots/2.png) |

| 终端 | SFTP |
|:---:|:---:|
| ![终端](./screenshots/3.png) | ![SFTP](./screenshots/4.png) |

## 许可证

本项目基于 [GNU Affero 通用公共许可证 v3.0](./LICENSE) 开源。
