FROM mongo:6.0

# Install cron and AWS CLI + MongoDB tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends cron awscli && \
    rm -rf /var/lib/apt/lists/*

# Copy backup & restore scripts
COPY backup-mongo.sh restore-mongo.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup-mongo.sh /usr/local/bin/restore-mongo.sh

# Install cron schedule (once per day at 03:00 UTC/server time)
COPY crontab.txt /etc/cron.d/mongo-backup
RUN chmod 0644 /etc/cron.d/mongo-backup

# Copy entrypoint script to handle env variables for backup script run by cron
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run cron in foreground
CMD ["docker-entrypoint.sh"]
