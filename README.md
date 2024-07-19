# Reproduce Credential Revocation Issue

This project is designed to reproduce an issue with credential revocation in the @credo-ts/core library. Follow the instructions below to set up and run the project.

## Prerequisites

- Node.js and npm installed on your machine
- A running Tails Server with `tailsServerBaseUrl` and `tailsDirectoryPath` configured

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/tarunvaddeSoul/credo-anoncreds-revocation-issue.git
    cd credo-anoncreds-revocation-issue
    ```

2. Install the dependencies:
    ```bash
    npm install
    ```

## Running the Project

1. Create a `.env` file in the root of the project with the following content:
    ```env
    TAILS_SERVER_BASE_URL=<your_tails_server_base_url>
    TAILS_DIRECTORY_PATH=<your_tails_directory_path>
    ```

2. Start the project:
    ```bash
    npm start
    ```

The `npm start` command will build and start the project, executing the following steps:

1. The issuer will create a schema.
2. The issuer will create a credential definition.
3. The issuer will create a revocation registry definition and a revocation status list.
4. A connection will be established between the issuer and the holder.
5. The issuer will issue 5 anoncreds credentials to the holder.
6. The issuer will then attempt to revoke these 5 credentials.

