FROM node:16-alpine

WORKDIR /opt/app

ADD ./package.json .
ADD ./yarn.lock .

RUN yarn install

ADD . .

CMD [ "node", "index.js" ]

