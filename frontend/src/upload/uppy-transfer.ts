import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import type { Transfer } from '../api/multipart';
import { UploadRequestError } from '../api/uploads';

export type TransferDriver = (file: File, transfer: Transfer, signal: AbortSignal, progress: (bytes: number) => void) => Promise<void>;
/** Public Uppy6 Companion mode. One active file here; the panel owns the global two-slot budget. */
export const transferWithUppy: TransferDriver = (file, transfer, signal, progress) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new UploadRequestError('UNAVAILABLE')); return; }
  const uppy = new Uppy({ autoProceed:false, logger:{ debug() {}, warn() {}, error() {} }, restrictions:{ maxNumberOfFiles:1 } });
  let settled=false;
  const finish=(error?: UploadRequestError) => {
    if(settled)return;settled=true;signal.removeEventListener('abort',abort);
    // destroy may send Companion DELETE; that endpoint deliberately detaches without terminal cancel.
    if(error){uppy.destroy();reject(error);}else{setTimeout(()=>uppy.destroy(),0);resolve();}
  };
  const abort=()=>{uppy.pauseAll();finish(new UploadRequestError('UNAVAILABLE'));};
  try {
    uppy.use(AwsS3,{ companionEndpoint:'/api/v1/uppy', shouldUseMultipart:true, limit:1, allowedMetaFields:false,
      getChunkSize:()=>transfer.partSizeBytes });
    const id=uppy.addFile({name:transfer.id,type:file.type,data:file,meta:{}});
    // Application UUID handles, never a storage key/provider uploadId. Server ListParts is authoritative.
    uppy.setFileState(id,{s3Multipart:{key:transfer.id,uploadId:transfer.id}});
    uppy.on('upload-progress',(_file,p)=>{if(!settled&&!signal.aborted)progress(p.bytesUploaded??0);});
    uppy.on('upload-success',()=>finish());
    uppy.on('upload-error',()=>finish(new UploadRequestError('UNAVAILABLE')));
    signal.addEventListener('abort',abort,{once:true});
    void uppy.upload().catch(()=>finish(new UploadRequestError('UNAVAILABLE')));
  } catch { finish(new UploadRequestError('UNAVAILABLE')); }
});
