FROM python:3.12-slim

RUN groupadd --system app && \
    useradd --system --no-create-home --gid app app

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

USER app

EXPOSE 8000

CMD ["gunicorn", "--config", "/app/backend/gunicorn.conf.py", "backend.app:app"]
