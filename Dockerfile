# 使用 Python 3.9 作为基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装 git（用于安装 modnet-entry）
RUN apt-get update && apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .
COPY .env .

# 安装依赖
RUN pip install --upgrade pip && \
    pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt && \
    pip install --no-cache-dir git+https://github.com/RimoChan/modnet-entry.git

# 复制项目文件
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["python", "server.py"] 