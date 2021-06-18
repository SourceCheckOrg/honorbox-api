FROM ubuntu:20.04

RUN apt-get update \
  && apt-get install -y curl gnupg build-essential \
  && curl --silent --location https://deb.nodesource.com/setup_14.x | bash - \
  && apt-get update \
  && apt-get install -y nodejs

ENV NODE_ENV production
WORKDIR /honorbox-api
COPY ./ .
RUN npm run build
EXPOSE 1337

CMD ["npm", "start"]
