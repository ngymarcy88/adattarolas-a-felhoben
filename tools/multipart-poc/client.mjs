import { createApp, ref, onMounted, h } from 'vue';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';

// URLs/session capabilities exist only in memory. No Uppy default error logger.
const silentLogger = { debug() {}, warn() {}, error() {} };
const json = async (path, body) => {
  const response = await fetch(path, { cache: 'no-store', ...(body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {}) });
  if (!response.ok) throw new Error('POC_REQUEST_FAILED');
  return response.json();
};

createApp({
  setup() {
    const status = ref('Elkülönített multipart PoC; nincs alkalmazás-auth vagy kvótamódosítás.');
    const running = ref(false);
    async function run() {
      if (running.value) return;
      running.value = true;
      // Test-only observation of physical XHR requests. Never record the URL itself.
      const attempts = [];
      const settledRequests = [];
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const observations = new WeakMap();
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        const parsed = new URL(url, location.href);
        if (parsed.searchParams.has('uploadId')) {
          observations.set(this, { method, partNumber: Number(parsed.searchParams.get('partNumber')) || null });
        }
        return originalOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const observation = observations.get(this);
        if (observation) {
          const entry = { ...observation, sizeBytes: body instanceof Blob ? body.size : 0, status: null };
          attempts.push(entry);
          settledRequests.push(new Promise((resolve) => {
            this.addEventListener('loadend', () => { entry.status = this.status; resolve(); }, { once: true });
          }));
        }
        return originalSend.call(this, body);
      };
      try {
        const inputs = await json('/poc/inputs');
        const results = [];
        for (const input of inputs) {
          const firstAttempt = attempts.length;
          status.value = `${input.name}: új Uppy példány, szerveroldali részlista alapján folytatás…`;
          const response = await fetch(`/poc/image/${input.name}`, { cache: 'no-store' });
          const blob = await response.blob();
          const uppy = new Uppy({ logger: silentLogger, autoProceed: false });
          uppy.use(AwsS3, { shouldUseMultipart: true, getChunkSize: () => input.partSize,
            limit: 1, allowedMetaFields: false,
            signRequest: (request) => json('/poc/sign', { name: input.name, request }),
          });
          const id = uppy.addFile({ name: `${input.name}.png`, type: 'image/png', data: blob });
          // Public file state used by Uppy 6 to reconstruct a multipart transfer.
          // Production must load this identity from an authorized durable backend session.
          uppy.setFileState(id, { s3Multipart: { key: input.key, uploadId: input.uploadId } });
          const uploaded = await uppy.upload();
          // Uppy may resolve on XHR load before the final loadend observation.
          await Promise.all(settledRequests);
          if (uploaded.failed.length || uploaded.successful.length !== 1) throw new Error('POC_UPLOAD_FAILED');
          results.push({ name: input.name, attempts: attempts.slice(firstAttempt) });
          uppy.destroy();
        }
        const result = await json('/poc/result', { results, userAgent: navigator.userAgent });
        status.value = JSON.stringify(result, null, 2);
      } catch {
        status.value = 'FAIL: a PoC nem igazolt; részletek vagy hozzáférési URL-ek naplózása nélkül.';
        await json('/poc/failure', {}).catch(() => {});
      } finally {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
        running.value = false;
      }
    }
    onMounted(() => { if (new URL(location.href).searchParams.get('auto') === '1') void run(); });
    return () => h('main', [h('h1', 'CloudVault multipart PoC'),
      h('button', { disabled: running.value, onClick: run }, 'PoC futtatása'), h('pre', status.value)]);
  },
}).mount('#app');
