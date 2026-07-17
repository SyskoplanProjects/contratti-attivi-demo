using { com.reply.contrattiattivi as db } from '../db/schema';

@path: '/agente'
service agenteService @(requires: ['Utente','Revisore']) {
  action openThread(forceNew: Boolean) returns String;
  action sendMessage(message: String, thread_id: String) returns array of String;
  action deleteThread(thread_id: String) returns String;
}
