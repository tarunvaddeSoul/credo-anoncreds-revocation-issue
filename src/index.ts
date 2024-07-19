import { holder } from "./holder";
import { issuer, didRegisterAndImport } from "./issuer";
import {
  utils,
  CredentialState,
  AutoAcceptCredential,
  CredentialStateChangedEvent,
  CredentialEventTypes,
} from "@credo-ts/core";

const schemaAndCredentialDefinitionCreation = async () => {
  try {
    const schemaTemplate = {
      name: "Faber College" + utils.uuid(),
      version: "1.0.0",
      attrNames: ["name", "degree", "date"],
      issuerId: "did:indy:bcovrin:testnet:JM9L6HL2QCexjbn9WB46h9",
    };

    const { schemaState } = await issuer.modules.anoncreds.registerSchema({
      schema: schemaTemplate,
      options: {},
    });
    if (schemaState.state !== "finished") {
      throw new Error(
        `Error registering schema: ${
          schemaState.state === "failed" ? schemaState.reason : "Not Finished"
        }`
      );
    }
    const { credentialDefinitionState } =
      await issuer.modules.anoncreds.registerCredentialDefinition({
        credentialDefinition: {
          schemaId: schemaState.schemaId,
          issuerId: "did:indy:bcovrin:testnet:JM9L6HL2QCexjbn9WB46h9",
          tag: "latest",
        },
        options: { supportRevocation: true },
      });

    if (credentialDefinitionState.state !== "finished") {
      throw new Error(
        `Error registering credential definition: ${
          credentialDefinitionState.state === "failed"
            ? credentialDefinitionState.reason
            : "Not Finished"
        }}`
      );
    }

    return {
      schemaId: schemaState.schemaId,
      credentialDefinitionId: credentialDefinitionState.credentialDefinitionId,
    };
  } catch (error) {
    throw error;
  }
};

const connectionEstablishment = async () => {
  // Create out of band invitation
  const issuerInvitation = await issuer.oob.createInvitation({
    autoAcceptConnection: true,
  });
  // Accept the invitation
  const { connectionRecord } = await holder.oob.receiveInvitation(
    issuerInvitation.outOfBandInvitation
  );

  if (!connectionRecord) {
    throw new Error("Connection not found");
  }

  // Adding delay to ensure that the connection is established
  await sleep(5000);
  const issuerConnectionRecord = await issuer.connections.findAllByQuery({
    outOfBandId: issuerInvitation.id,
  });

  return {
    issuerConnectionId: issuerConnectionRecord[0].id,
    holderConnectionId: connectionRecord.id,
  };
};

const revRegDefAndRevRegStatusListCreation = async (
  credentialDefinitionId: string
) => {
  const response = await issuer.modules.anoncreds.getCredentialDefinition(
    credentialDefinitionId
  );
  let revocReg =
    await issuer.modules.anoncreds.registerRevocationRegistryDefinition({
      revocationRegistryDefinition: {
        maximumCredentialNumber: 10,
        issuerId: "did:indy:bcovrin:testnet:JM9L6HL2QCexjbn9WB46h9",
        tag: utils.uuid(),
        credentialDefinitionId: credentialDefinitionId,
      },
      options: {},
    });

  await sleep(1000);

  if (
    !revocReg ||
    revocReg.revocationRegistryDefinitionState.state !== "finished"
  ) {
    throw new Error(
      "Failed to register revocation definition on ledger." + revocReg
    );
  }

  const revocationRegistryDefinitionId =
    revocReg.revocationRegistryDefinitionState.revocationRegistryDefinitionId;

  let revocStatusList =
    await issuer.modules.anoncreds.registerRevocationStatusList({
      revocationStatusList: {
        revocationRegistryDefinitionId,
        issuerId: "did:indy:bcovrin:testnet:JM9L6HL2QCexjbn9WB46h9",
      },
      options: {},
    });

  await sleep(1000);

  if (
    !revocStatusList ||
    revocStatusList.revocationStatusListState.state !== "finished"
  ) {
    throw new Error(
      "Failed to register revocation status list on ledger." + revocStatusList
    );
  }

  return {
    revocationRegistryDefinitionId:
      revocReg.revocationRegistryDefinitionState.revocationRegistryDefinitionId,
  };
};

const sleep = async (ms: number) => {
  return new Promise((res) => setTimeout(res, ms));
};

holder.events.on<CredentialStateChangedEvent>(
  CredentialEventTypes.CredentialStateChanged,
  async ({ payload }) => {
    switch (payload.credentialRecord.state) {
      case CredentialState.OfferReceived:
        // custom logic here
        await holder.credentials.acceptOffer({
          credentialRecordId: payload.credentialRecord.id,
        });
        break;
      case CredentialState.Done:
        console.log(
          `Credential for credential id ${payload.credentialRecord.id}===>>> is accepted`
        );
        break;
      // For demo purposes we exit the program here.
    }
  }
);

const run = async () => {
  await issuer.initialize();
  await holder.initialize();

  // DID Registration on bcovrin:testnet
  await didRegisterAndImport(issuer);
  const schemaAndCredDefResponse =
    await schemaAndCredentialDefinitionCreation();
  const connectionResponse = await connectionEstablishment();
  const revRegResponse = await revRegDefAndRevRegStatusListCreation(
    schemaAndCredDefResponse.credentialDefinitionId
  );

  let credentialIds: string[] = [];

  // Issue 5 credentials
  for (let iteration = 1; iteration <= 5; iteration++) {
    const offerCredentialResponse = await issuer.credentials.offerCredential({
      connectionId: connectionResponse.issuerConnectionId,
      protocolVersion: "v2",
      credentialFormats: {
        anoncreds: {
          attributes: [
            {
              name: "name",
              value: "Alice Smith",
            },
            {
              name: "degree",
              value: "Computer Science",
            },
            {
              name: "date",
              value: "01/01/2022",
            },
          ],
          credentialDefinitionId:
            schemaAndCredDefResponse.credentialDefinitionId,
          revocationRegistryDefinitionId:
            revRegResponse.revocationRegistryDefinitionId,
          revocationRegistryIndex: Number(iteration),
        },
      },
      autoAcceptCredential: AutoAcceptCredential.Always,
    });
    await sleep(10000);

    credentialIds.push(offerCredentialResponse.id);
  }

  // Revoke 5 credentials
  for (let i = 0; i < 5; i++) {
    const doneCredentialRecord = await issuer.credentials.getById(
      credentialIds[i]
    );
    const credentialRevocationRegistryDefinitionId =
      doneCredentialRecord.getTag("anonCredsRevocationRegistryId") as string;

    const credentialRevocationIndex = doneCredentialRecord.getTag(
      "anonCredsCredentialRevocationId"
    ) as string;
    console.log("REVOKING CREDENTIAL ", credentialRevocationIndex);

    const statusList =
      await issuer.modules.anoncreds.updateRevocationStatusList({
        revocationStatusList: {
          revocationRegistryDefinitionId:
            credentialRevocationRegistryDefinitionId,
          revokedCredentialIndexes: [Number(credentialRevocationIndex)],
        },
        options: {},
      });
    console.log(JSON.stringify(statusList, null, 2));
    console.log("AFTER CREDENTIAL REVOCATION ATTEMPT ==>>", credentialRevocationIndex, statusList.revocationStatusListState.state);
    await issuer.credentials.sendRevocationNotification({
      credentialRecordId: doneCredentialRecord.id,
      revocationFormat: "anoncreds",
      revocationId: `${credentialRevocationRegistryDefinitionId}::${credentialRevocationIndex}`,
    });
  }
};

run();
