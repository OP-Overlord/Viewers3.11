import React, { useCallback, useState } from 'react';
import { unzipSync } from 'fflate';
import Dropzone from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore } from '@ohif/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dcmjs from 'dcmjs';

interface ProgressState {
  loaded: number;
  total: number;
  active: boolean;
  extracting: boolean;
  error: boolean;
}

// ─── Helpers ZIP ─────────────────────────────────────────────────────────────

const isZipFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith('.zip') ||
  file.type === 'application/zip' ||
  file.type === 'application/x-zip-compressed';

/** Verifica el magic DICM en el offset 128 */
const hasDicomMagic = (data: Uint8Array): boolean =>
  data.length > 132 &&
  data[128] === 0x44 && // D
  data[129] === 0x49 && // I
  data[130] === 0x43 && // C
  data[131] === 0x4d; // M

/** Determina si una entrada del ZIP es un archivo DICOM a procesar */
const isDicomEntry = (path: string, data: Uint8Array): boolean => {
  if (path.includes('__MACOSX') || path.endsWith('/') || data.length === 0) return false;
  const filename = (path.split('/').pop() ?? '').toLowerCase();
  if (!filename || filename.startsWith('.')) return false;
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return hasDicomMagic(data); // sin extensión → magic bytes
  const ext = filename.slice(dot + 1);
  return ['dcm', 'dicom', 'dic'].includes(ext);
};

/** Descomprime un ZIP y devuelve los File DICOM que contiene */
const expandZip = (zipFile: File): Promise<File[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      try {
        const data = new Uint8Array(target!.result as ArrayBuffer);
        const decompressed: Record<string, Uint8Array> = unzipSync(data);
        const files: File[] = [];
        for (const [path, content] of Object.entries(decompressed)) {
          if (!isDicomEntry(path, content)) continue;
          const name = path.split('/').pop() ?? path;
          files.push(new File([content.buffer], name, { type: 'application/octet-stream' }));
        }
        resolve(files);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(zipFile);
  });

// ─── Procesamiento DICOM ──────────────────────────────────────────────────────

const processFile = async (file: File): Promise<void> => {
  try {
    const imageId = dicomImageLoader.wadouri.fileManager.add(file);
    const image = await dicomImageLoader.wadouri.loadFileRequest(imageId);
    const dicomData = dcmjs.data.DicomMessage.readFile(image);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset.url = imageId;
    dataset._meta = dcmjs.data.DicomMetaDictionary.namifyDataset(dicomData.meta);
    dataset.AvailableTransferSyntaxUID =
      dataset.AvailableTransferSyntaxUID || dataset._meta.TransferSyntaxUID?.Value?.[0];
    DicomMetadataStore.addInstance(dataset);
  } catch (err) {
    console.warn('Error al procesar archivo local:', (err as Error).message);
  }
};

// ─── Componente ───────────────────────────────────────────────────────────────

function NovaLocalUpload() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ProgressState>({
    loaded: 0,
    total: 0,
    active: false,
    extracting: false,
    error: false,
  });

  const runLoad = useCallback(
    async (accepted: File[]) => {
      if (!accepted.length) return;

      // ── Paso 1: expandir ZIPs ──────────────────────────────────────────────
      const hasZip = accepted.some(isZipFile);
      if (hasZip) {
        setProgress({ loaded: 0, total: 0, active: true, extracting: true, error: false });
      }

      const all: File[] = [];
      for (const file of accepted) {
        if (isZipFile(file)) {
          try {
            const extracted = await expandZip(file);
            all.push(...extracted);
          } catch (e) {
            console.warn('Error al descomprimir ZIP:', e);
          }
        } else {
          all.push(file);
        }
      }

      if (!all.length) {
        setProgress({ loaded: 0, total: 0, active: false, extracting: false, error: true });
        return;
      }

      // ── Paso 2: cargar DICOM con barra de progreso ─────────────────────────
      setProgress({ loaded: 0, total: all.length, active: true, extracting: false, error: false });

      for (const file of all) {
        await processFile(file);
        setProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }));
      }

      // ── Paso 3: navegar al visor ───────────────────────────────────────────
      const studyUIDs = DicomMetadataStore.getStudyInstanceUIDs();
      if (!studyUIDs.length) {
        setProgress(prev => ({ ...prev, active: false, error: true }));
        return;
      }
      const query = new URLSearchParams();
      studyUIDs.forEach(id => query.append('StudyInstanceUIDs', id));
      navigate(`/desktop/dicomlocal?${decodeURIComponent(query.toString())}`);
    },
    [navigate]
  );

  const percentage = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <Dropzone
      onDrop={runLoad}
      noClick
      disabled={progress.active}
    >
      {({ getRootProps, isDragActive }) => (
        <div
          {...getRootProps()}
          style={{ width: '100%', height: '100%' }}
          className="bg-black"
        >
          <div className="flex h-screen w-screen items-center justify-center">
            <div
              className={`bg-muted px-22 mx-auto space-y-6 rounded-xl border border-dashed py-20 drop-shadow-md transition-colors duration-150 ${
                isDragActive ? 'bg-blue-950/20 border-blue-400' : 'border-primary/60'
              }`}
            >
              {/* Logo NOVA Imaging */}
              <div className="flex items-center justify-center">
                <img
                  src="/nova-dark.svg"
                  alt="NOVA Imaging"
                  style={{ height: '3rem' }}
                />
              </div>

              {/* Contenido principal */}
              <div className="space-y-4 py-4 text-center">
                {progress.extracting ? (
                  /* Extrayendo ZIP */
                  <div className="flex w-[520px] flex-col items-center justify-center space-y-4">
                    <p className="text-primary text-lg font-medium">
                      Descomprimiendo archivo ZIP...
                    </p>
                    <div className="bg-secondary h-3 w-full overflow-hidden rounded-full">
                      <div className="bg-primary h-3 w-full animate-pulse rounded-full" />
                    </div>
                    <p className="text-muted-foreground text-sm">Extrayendo archivos DICOM...</p>
                  </div>
                ) : progress.active ? (
                  /* Cargando DICOM */
                  <div className="flex w-[520px] flex-col items-center justify-center space-y-4">
                    <p className="text-primary text-lg font-medium">Cargando archivos DICOM...</p>
                    <div className="bg-secondary h-3 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-3 rounded-full transition-all duration-200 ease-out"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {progress.loaded} de {progress.total} archivos cargados ({percentage}%)
                    </p>
                  </div>
                ) : progress.error ? (
                  <div className="w-[520px] space-y-2">
                    <p className="text-destructive text-base">
                      No se pudieron cargar los archivos DICOM.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Verifique que los archivos sean DICOM válidos e intente de nuevo.
                    </p>
                  </div>
                ) : (
                  /* Estado inicial */
                  <div className="w-[520px] space-y-2">
                    <p className="text-primary pt-0 text-xl">
                      Arrastra y suelta tus archivos, carpetas
                      <br />o archivos <span className="font-semibold">.zip</span> con imágenes en
                      formato DICOM, aquí.
                    </p>
                    <br />
                    <p className="text-muted-foreground text-base">
                      Tus datos permanecen en tu navegador
                      <br /> y nunca salen de tu ordenador.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dropzone>
  );
}

export default NovaLocalUpload;
