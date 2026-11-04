import { createBarcodeLookup } from '../domain/barcodeLookup';
// Browser User-Agent is controlled by the browser; app_name/version identify
// this client in the query. Native additionally supplies the custom header.
export const lookupBarcode = createBarcodeLookup();
