import React from 'react';
import { AboutModal } from '@ohif/ui-next';
import detect from 'browser-detect';

function AboutModalDefault() {
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substr(1)} ${version}`;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const [main, beta] = versionNumber.split('-');

  return (
    <AboutModal className="w-[400px]">
      <AboutModal.ProductName>NOVA Viewer</AboutModal.ProductName>
      <AboutModal.ProductVersion>{main}</AboutModal.ProductVersion>

      <AboutModal.Body>
        <AboutModal.DetailItem
          label="Buscador Actual & Sistema Operativo"
          value={`${browser}, ${os}`}
        />
        <AboutModal.SocialItem
          icon="Info"
          url="https://novaimaging.co/"
          text="www.novaimaging.co"
        />
      </AboutModal.Body>
    </AboutModal>
  );
}

export default {
  'ohif.aboutModal': AboutModalDefault,
};
