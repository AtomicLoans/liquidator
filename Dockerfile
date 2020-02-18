FROM node:10

WORKDIR /app

RUN apt-get update
RUN apt-get install -y libusb-1.0-0 libusb-1.0-0-dev libudev-dev 

COPY package*.json ./

RUN npm ci

ADD . /app

EXPOSE 3030 3032
