import {api} from './github';

export const DEFAULT_PLANS={free:{label:'FREE',ngn:0,usd:0,builds:5},pro:{label:'PRO',ngn:15000,usd:9.99,builds:50},proPlus:{label:'PRO+',ngn:30000,usd:19.99,builds:200}};

export const getBillingStatus=()=>api('/api/billing/status');

export function openWyDevBilling(){
  const url=import.meta.env.VITE_WYDEV_BILLING_URL;
  if(!url) throw new Error('WyDev billing URL is not configured.');
  window.location.assign(url);
}
