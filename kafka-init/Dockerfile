FROM apache/kafka:4.0.0

USER root
COPY init-topics.sh /init-topics.sh
RUN chmod +x /init-topics.sh

USER appuser
ENTRYPOINT ["/init-topics.sh"]
