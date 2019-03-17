FROM node:alpine AS base

RUN apk add -U tzdata
RUN mkdir -p /var/log/services

#
# Build dependencies
FROM base AS build-dependencies

RUN mkdir -p /opt/svc/auth

# install dependencies to git submodule
RUN npm install -g typescript

#
# Build
FROM build-dependencies AS build
WORKDIR /opt/svc/auth

COPY . .

RUN npm install

# produces a dist folder
RUN tsc --build

#
# Release
FROM base AS release
WORKDIR /opt/

COPY package.json package-*.json /opt/
RUN npm install --production

# copy in distribution code
COPY --from=build /opt/svc/auth/dist/ /opt/

CMD ["node", "main.js"]