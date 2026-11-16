import { parseCadastralWorkbook } from './cadastralImport';

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ snapshot: parseCadastralWorkbook(data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer la planilla.' });
  }
};
