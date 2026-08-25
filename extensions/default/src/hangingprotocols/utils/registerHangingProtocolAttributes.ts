import viewCode from './viewCode';
import laterality from './laterality';
import ctMrInitialSlice from './ctMrInitialSlice';

export default function registerHangingProtocolAttributes({ servicesManager }) {
  const { hangingProtocolService } = servicesManager.services;
  hangingProtocolService.addCustomAttribute('ViewCode', 'View Code Designator:Value', viewCode);
  hangingProtocolService.addCustomAttribute('Laterality', 'Laterality of object', laterality);
  hangingProtocolService.addCustomAttribute(
    'ctMrInitialSlice',
    'Corte inicial: medio para CT/MR, primero para el resto',
    ctMrInitialSlice
  );
}
