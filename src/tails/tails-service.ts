import type { AnonCredsRevocationRegistryDefinition } from '@credo-ts/anoncreds'
import type { AgentContext } from '@credo-ts/core'
import { BasicTailsFileService } from '@credo-ts/anoncreds'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import https from 'https';
import http from 'http';
export class FullTailsFileService extends BasicTailsFileService {
  private tailsServerBaseUrl?: string
  public constructor(options?: { tailsDirectoryPath?: string; tailsServerBaseUrl?: string }) {
    super(options)
    this.tailsServerBaseUrl = options?.tailsServerBaseUrl
  }

public async uploadTailsFile(
    agentContext: AgentContext,
    options: {
      revocationRegistryDefinition: AnonCredsRevocationRegistryDefinition
    }
  ): Promise<{ tailsFileUrl: string }> {
    const revocationRegistryDefinition = options.revocationRegistryDefinition
    const localTailsFilePath = revocationRegistryDefinition.value.tailsLocation
  
    const tailsFileId = revocationRegistryDefinition.value.tailsHash
    const form = new FormData();
    form.append('file', fs.createReadStream(localTailsFilePath), {
      filename: path.basename(localTailsFilePath),
      contentType: 'application/octet-stream',
    });
  
    const url = new URL(`${this.tailsServerBaseUrl}/${tailsFileId}`);
  
    return new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method: 'PUT',
        headers: form.getHeaders(),
      }, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Cannot upload tails file: ${data}`));
          } else {
            resolve({ tailsFileUrl: `${this.tailsServerBaseUrl}/${encodeURIComponent(tailsFileId)}` });
          }
        });
      });
  
      request.on('error', (error) => {
        reject(error);
      });
  
      form.pipe(request);
    });
  }
}
