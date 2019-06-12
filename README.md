# Toddler: auth service

Tribal Wars 2 authentication service includes authentication service, socket client and a message-queue connections.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

To run locally, you will need to install [CF Local](https://pivotal.io/cf-local). CF Local requires access to an installation of Docker. If Docker is installed locally, this is satisfied.

To install CF Local, invoke 

```
cf install-plugin cflocal
```

If you are using IBM Cloud CLI, IBM Cloud CLI bundles CF CLI. Hence CF CLI does not need to be installed separately. Invoke 

```
ibmcloud cf install-plugin cflocal
```

### Building

First, install dependencies with

```
npm install
```

Then, build with

```
npm run-script build
```

Or, alternatively,

```
node_modules/typescript/bin/tsc --build
```

### Installing

First, stage the application with 

```
ibmcloud cf local stage toddler-auth
```

![](https://lettus.xyz/content/images/2019/06/stage.gif)

Then, run the application with 

```
ibmcloud cf local run toddler-auth
```

![](https://lettus.xyz/content/images/2019/06/run.gif)

## Built With

* [NATS.io](http://nats.io) - Message queue technology used

## Authors

* **Cong Nguyen** - [Profile](https://github.com/rampadc)

## License

This project is licensed under the Apache 2.0 License 
