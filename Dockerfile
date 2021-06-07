FROM ubuntu:20.04

RUN apt-get update \
  && apt-get install -y curl gnupg build-essential \
  && curl --silent --location https://deb.nodesource.com/setup_14.x | bash - \
  && apt-get update \
  && apt-get install -y nodejs

WORKDIR /honorbox-api
COPY ./honorbox-api .
ENV NODE_ENV production
EXPOSE 1337

CMD ["npm", "start"]
