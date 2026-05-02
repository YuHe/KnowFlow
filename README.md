# KnowFlow

> 面向团队的知识管理平台 —— 让知识沉淀、流动、生长。

KnowFlow 是一个开源的团队知识库系统，支持富文本编辑、多级目录、成员协作、文档版本管理、全文搜索等核心功能，并提供完整的 Docker 一键部署方案。

---

## ✨ 功能特性

- **富文本编辑器**：基于 TipTap v2，支持 Markdown、代码块（语法高亮）、表格、任务列表、图片上传、斜杠命令
- **知识库管理**：公开/私有知识库，多级分组，文档拖拽排序
- **团队协作**：知识库成员管理（Owner / Admin / Editor / Viewer），文档评论
- **文档版本**：手动保存快照，支持版本对比与一键回滚
- **全文搜索**：基于 PostgreSQL `tsvector`，支持跨知识库搜索
- **分享链接**：一键生成文档分享链接，可设置密码与有效期
- **导出**：支持导出 Markdown、Word（docx）、PDF
- **公开知识库**：支持 slug 访问的只读公开知识库
- **管理后台**：用户管理、知识库管理、系统设置

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand + TipTap v2 |
| 后端 | FastAPI + SQLAlchemy 2 (async) + Alembic |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 部署 | Docker Compose + Nginx |

---

## 🚀 快速部署

### 前置条件

- Docker >= 24
- Docker Compose >= 2.20

### 1. 克隆项目

```bash
git clone https://github.com/YuHe/KnowFlow.git
cd KnowFlow
```

### 2. 配置环境变量

```bash
cp backend/.env.example .env
```

编辑 `.env` 文件，至少设置以下变量：

```env
DB_PASSWORD=your_strong_db_password
JWT_SECRET=your_64_char_random_secret
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=your_admin_password
```

### 3. 启动服务

```bash
docker-compose up -d
```

首次启动会自动执行数据库迁移并创建超级管理员账号。

### 4. 访问

| 服务 | 地址 |
|---|---|
| 前端应用 | http://localhost:8192 |
| 后端 API | http://localhost:8192/api/v1 |
| API 文档 | http://localhost:8192/api/docs |

---

## 🗂 项目结构

```
KnowFlow/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── models/         # SQLAlchemy 数据模型
│   │   ├── routers/        # API 路由（15个模块）
│   │   ├── schemas/        # Pydantic 响应模型
│   │   ├── services/       # 业务逻辑（版本服务等）
│   │   └── utils/          # 工具（权限、JWT、导出等）
│   ├── alembic/            # 数据库迁移
│   ├── tests/              # pytest 测试套件
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # React 前端
│   ├── src/
│   │   ├── api/            # Axios API 封装
│   │   ├── components/     # UI 组件（editor/doc/tree/kb）
│   │   ├── hooks/          # 自定义 Hook（useAutoSave 等）
│   │   ├── pages/          # 页面组件
│   │   ├── store/          # Zustand 状态管理
│   │   └── types/          # TypeScript 类型定义
│   └── Dockerfile
├── e2e/                    # 端到端测试
├── docker-compose.yml
└── .env.example
```

---

## 🧪 运行测试

```bash
cd backend
pip install -r requirements.txt
pip install aiosqlite pytest-asyncio httpx
pytest -v
```

---

## 🔧 本地开发

**后端**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 启动 PostgreSQL & Redis（可用 Docker）
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# 配置环境
cp .env.example .env  # 编辑填入 DATABASE_URL 等

# 迁移 & 启动
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**前端**

```bash
cd frontend
npm install
npm run dev  # 默认 http://localhost:5173
```

---

## 📋 API 规范

所有接口返回统一格式：

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

分页接口：

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "total_pages": 5
  }
}
```

---

## 📄 License

[MIT](./LICENSE)
