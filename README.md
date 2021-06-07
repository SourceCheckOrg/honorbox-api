# Monetiza HonorBox API

API server for the [HonorBox
Project](https://github.com/monetiza/honorbox), based on
[Strapi](https://strapi.io).


## Development environment setup

### Database 

The HonorBox API requires a MySQL database and a Redis database. By default, both
are assumed to be running on the localhost, at their default ports. In
production this would, of course, not be recommended.

A simple dockerized setup for both can be found at [HonorBox
DB](https://github.com/monetiza/honorbox-db).

### Node.js

A recent version of Node.js is required to run the API server.

We recommend installing Node.js in Linux and MacOS environments by using Node
Version Manager [nvm](https://github.com/nvm-sh/nvm).

The code was created using `v14.15.3`.

### SSI tooling

The HonorBox project depends on SSI (Self-Sovereign Identities) components developed by [Spruce
Systems](https://spruceid.dev/docs/) (USA). 

The API server makes use of DIDKit Node library for handling DIDs and
signatures. Configuring it to issue credentials already requires a DID to sign
them, which can be done using DIDKit's command line interface. If any of the
following fails to build, check the latest instructions on their [DIDKit
repository](https://github.com/spruceid/didkit/).

DIDKit is written in [Rust](https://www.rust-lang.org/), which should be
installed using [Rustup](https://rustup.rs/).

Clone Spruce's ssi repository:
```
$ git clone https://github.com/spruceid/ssi --recurse-submodules
```

Clone Spruce's DIDKit repository:
```
$ git clone https://github.com/spruceid/didkit
```

Build DIDKit using Cargo:
```
$ cd didkit
$ cargo build
```

Once DIDKit is built, use it to generate a DID and a DID keypair:
```
$ ./target/debug/didkit generate-ed25519-key > key.jwk
$ ./target/debug/didkit key-to-did key -k key.jwk > did.txt
```

*NOTE:* Save the files `key.jwk` and `did.txt` in a safe place. The content of
the file `key.jwt` will be used as the environment variable `ISSUER_KEY` and the
content of the file `did.txt` will be used as the environment variable
`ISSUER_DID`. These values should be set in the file `.env` of this repository.
More information on that below. 

### ngrok

The API server should be visible through a public URL so Spruce's Credible
wallet can interact with it.

One way to do that is to use [ngrok](https://ngrok.com/). 

It's necessary to create a tunnel pointing to the `HTTP` port `1337`:

```
./ngrok http 1337
```

The address created by ngrok (something like https://020cd6dc2d4a.ngrok.io)
should be set as the environment variable `URL` in the file `.env`.

## Installing HonorBox API code

Clone this repository:
```
$ git clone https://github.com/monetiza/honorbox-api.git
```

Install the dependencies
```
$ cd honorbox-api
$ npm i --update-binary
```

Set up the environment variables mentioned before in the file called `.env`. For
security reasons, this file is not pushed to git, but a sample one is provided
with the name `.env.sample`. You can use it as starting point and change the
values according to your environment:

```
ADMIN_JWT_SECRET=your_admin_jwt_secret
JWT_SECRET=your_jwt_secret
ISSUER_DID=your_did
ISSUER_KEY=content_of_your_jwk_file

DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=honorbox-db
DATABASE_USERNAME=root
DATABASE_PASSWORD=your_database_root_password
DATABASE_SSL=false

FRONTEND_HOST=http://localhost
FRONTEND_PORT=3000

PREVIEW_HOST=http://localhost
PREVIEW_PORT=3001

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

URL=url_generated_by_ngrok
```

Build the administration panel using the provided configuration:
```
$ npm run build
```

Start the API server:
```
$ npm run develop
```

## Initial configuration

### Admin panel

Access the administration panel through the URL `http://localhost:1337/admin`.

You can also use the host provided by ngrok instead of `localhost`. 

### Create admin user

When you are accessing the administration panel for the first time, you will be
requested to create an admin user.

Fill in the form and click on the button "LET'S START"

### Permissions configuration

For now, some initial permissions should be configured manually.

From the administration panel, click on "Settings"
* Under USERS & PERMISSIONS PLUGIN, click on "Roles"
* Click on the "Edit" button (Pencil) for the **Authenticated** role
    * Under Permissions/Application/Publication, check `create`, `delete`, `find`,
      `findone`, `preview`, `publish`, `update` and `verify`
    * Under Permissions/Application/Publisher, check `create`, `find`, `findone` and `update
      permissions`
    * Under Permissions/Application/Royalty-Structure, check `create`, `delete`, `find`,
      `findone` and `update`
* Under USERS & PERMISSIONS PLUGIN, click on "Roles" again
* Click on the "Edit" button (Pencil) for the **Public** role
    * Under Permissions/Application/Publications, check `preview` and `verify`
    * Under Permissions/SourceCheck/Auth, check `signup`, `ssisignin`, `ssisigninrequest`, `ssisignup`, `ssisignuprequest`
    * Under Permissions/SourceCheck/PublisherCredentials, check `publishercredentialissuance`, `publishercredentialoffer`, `publisherpresentationprocessing`, `publisherpresentationrequest`

Congratulations! The API server is properly configured, up and running!
