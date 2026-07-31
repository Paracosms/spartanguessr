FROM python:3.12-slim

RUN groupadd --system --gid 10001 catalogread && \
    groupadd --system app && \
    useradd --system --no-create-home --gid app --groups catalogread app

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

USER app

EXPOSE 8000

CMD ["gunicorn", "--chdir", "/app/backend", "--config", "/app/backend/gunicorn.conf.py", "app:app"]
