const cds = require('@sap/cds');
const openai = require('./modules/openai-module');

const ASSISTANT_ID = process.env.ASSISTANT_ID || '';

module.exports = class agenteService extends cds.ApplicationService {
  async init() {
    const { ChatThread } = cds.entities('com.reply.contrattiattivi');

    this.on('openThread', async (req) => {
      const { forceNew } = req.data || {};
      if (forceNew) {
        const existing = await SELECT.one.from(ChatThread).where({ utente: req.user.id });
        if (existing) {
          try { await openai.deleteThread(existing.threadID); } catch (e) { /* ignore */ }
          await DELETE.from(ChatThread).where({ utente: req.user.id });
        }
      } else {
        const existing = await SELECT.one.from(ChatThread).where({ utente: req.user.id });
        if (existing) return existing.threadID;
      }

      const threadId = await openai.openThread();
      await INSERT.into(ChatThread).entries({
        ID: cds.utils.uuid(), utente: req.user.id, threadID: threadId
      });
      return threadId;
    });

    this.on('sendMessage', async (req) => {
      const { message, thread_id } = req.data;
      if (!ASSISTANT_ID) return req.reject(500, 'ASSISTANT_ID non configurato');
      const replies = await openai.sendMessage(message, thread_id, ASSISTANT_ID);
      return replies;
    });

    this.on('deleteThread', async (req) => {
      const { thread_id } = req.data;
      if (thread_id) {
        try { await openai.deleteThread(thread_id); } catch (e) { /* ignore */ }
        await DELETE.from(ChatThread).where({ threadID: thread_id });
      } else {
        await DELETE.from(ChatThread).where({ utente: req.user.id });
      }
      return 'deleted';
    });

    return super.init();
  }
};
