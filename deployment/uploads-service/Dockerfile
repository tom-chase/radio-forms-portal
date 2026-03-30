FROM python:3.11-alpine

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY server.py /app/server.py

EXPOSE 3002

CMD ["python", "/app/server.py"]
