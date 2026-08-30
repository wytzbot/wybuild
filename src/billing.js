import {api} from './github';

export const DEFAULT_PLANS={
  free:{label:'FREE',ngn:0,usd:0,builds:5,concurrency:1,features:[
    '5 successful builds / month',
    '1 build in progress at a time',
    'APK, AAB & Web builds',
    'Automatic project detection (Flutter, Gradle, Next.js, Vite/React, Node, HTML)',
    'Full GitHub Actions build logs',
    'GitHub Release publishing'
  ]},
  pro:{label:'PRO',ngn:15000,usd:9.99,builds:50,concurrency:5,features:[
    '50 successful builds / month',
    'Up to 5 builds in progress at once',
    'Everything in Free',
    'Priority email support'
  ]},
  proPlus:{label:'PRO+',ngn:30000,usd:19.99,builds:200,concurrency:15,features:[
    '200 successful builds / month',
    'Up to 15 builds in progress at once',
    'Everything in Pro',
    'Priority queue during high-traffic periods'
  ]}
};

export const getBillingStatus=()=>api('/api/billing/status');

export function openWyDevBilling(){
  const url=import.meta.env.VITE_WYDEV_BILLING_URL;
  if(!url) throw new Error('WyDev billing URL is not configured.');
  window.location.assign(url);
}
