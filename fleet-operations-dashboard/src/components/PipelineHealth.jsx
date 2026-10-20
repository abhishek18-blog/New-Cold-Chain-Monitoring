import React from 'react';
import { Activity, Server, Radio, Database, Archive } from 'lucide-react';

export default function PipelineHealth({ health }) {
  const isPubSubOk = health?.pubsub_connected !== false;
  const isFirestoreOk = health?.firestore_connected !== false;

  const services = [
    { name: 'Google Cloud Pub/Sub', icon: Radio, status: isPubSubOk ? 'STREAMING ●' : 'DEGRADED ●', active: isPubSubOk },
    { name: 'Stream Processor (Cloud Run)', icon: Server, status: 'PROCESSING ●', active: true },
    { name: 'Cloud Firestore NoSQL', icon: Database, status: isFirestoreOk ? 'CONNECTED ●' : 'DISCONNECTED ●', active: isFirestoreOk },
    { name: 'BigQuery / Storage Stream', icon: Archive, status: 'INGESTING ●', active: true },
  ];

  return (
    <div className="bg-[#1A140D] border border-[#3A2B20] rounded-lg p-4 text-[#F5F0E1] shadow-sm select-none">
      <div className="flex items-center justify-between pb-3 border-b border-[#3A2B20] mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5E6D3]">
          Pipeline Health
        </h3>
        <Activity className="w-4 h-4 text-[#F59E0B]" />
      </div>

      <div className="space-y-2.5">
        {services.map((svc, i) => {
          const Icon = svc.icon;
          return (
            <div key={i} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2 text-[#F5E6D3]">
                <Icon className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="font-medium">{svc.name}</span>
              </div>
              <span className={`font-mono text-[11px] font-semibold ${svc.active ? 'text-[#F6D18A]' : 'text-[#EF4444]'}`}>
                {svc.status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-[#3A2B20]/60 text-[11px] text-[#C9B7A8]">
        GCP Serverless Event Pipeline · Pub/Sub Direct Ingestion
      </div>
    </div>
  );
}

