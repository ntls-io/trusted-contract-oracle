# cbdc-challenge oracle

## Running The Project

Clone this repository then run npm install

```bash
npm install
```

## Environment Variables

Setup the environmental variables by copying the .env-copy into a .env file

```bash
cp .env-copy .env
```

## MongoDB setup

To use a local mongodb instance follow the steps below:

### Mac

On Mac use homebrew. If not installed install it.

Add the mongodb repo to homebrew

```bash
brew tap mongodb/brew
```

Install community mongodb

```bash
brew install mongodb-community@6.0
```

In a separate terminal run

## Local Deployment

Build docker

```bash
docker build -t cbdc-oracle .
```

run docker

```bash
docker run -p 5001:5001 -e MONGO_PASSWORD='' -e MONGO_USER='' -e MONGO_URL='' -e MONGO_DB='' cbdc-oracle
```

## Azure Deployment

Follow this tutorial https://learn.microsoft.com/en-us/azure/container-instances/container-instances-quickstart

Summary:

Install Azure CLI https://learn.microsoft.com/en-us/cli/azure/install-azure-cli

Sign in with this command

```bash
az login
```

Create resource group

```bash
az group create --name cbdc-resource-group --location eastus
```

Create private docker container registry

Take note of loginServer in the output, which is the fully qualified registry name (all lowercase).

```bash
az acr create --resource-group cbdc-resource-group --name cbdccontainerregistry --sku Basic
```

Make sure admin in enabled

```bash
az acr update -n cbdccontainerregistry --admin-enabled true
```

Login to registry

```bash
az acr login --name cbdccontainerregistry
```

Build and push a container to registry

```bash
az acr build -t cbdc-oracle:v1 -r cbdccontainerregistry .
```

Create a container app on Azure using the new docker image

If asked for credentials anywhere in the process:

```bash
az acr credential show -n cbdccontainerregistry
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```
