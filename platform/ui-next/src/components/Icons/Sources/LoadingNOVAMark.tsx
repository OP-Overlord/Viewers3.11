import React from 'react';
import type { IconProps } from '../types';

export const LoadingNOVAMark = (props: IconProps) => {
  return (
    <div style={{ textAlign: 'center', paddingTop: '20%' }}>
      <img src="./loading-ohif-mark.svg" width="100" alt="Cargando..." />
      <p style={{ color: 'white', marginTop: '1rem' }}>Cargando...</p>
    </div>
  );
};

export default LoadingNOVAMark;
