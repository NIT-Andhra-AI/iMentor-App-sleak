import NetInfo from '@react-native-community/netinfo';
import { useChatStore } from '../store/chat.store';
import { getQueue, clearQueue, removeFromQueue } from './offlineQueue.service';
import { apiService } from './api.service';

export const syncOfflineQueue = async () => {
  const queue = await getQueue();
  if (queue.length === 0) return;

  console.log(`Syncing ${queue.length} offline conversations to MongoDB...`);
  useChatStore.getState().setSyncing(true);

  try {
    for (const entry of queue) {
      try {
        // We only create messages. We assume the conversation ID might already exist,
        // or we need to create it. For offline, we use local string IDs, which might fail
        // in MongoDB if they expect ObjectIds. Wait, if the user was offline,
        // createNewChat() generates a local ID 'local-1234'.
        // Wait, if it's a local ID, MongoDB might reject it if it expects ObjectId.
        // We will just attempt to push messages to it, and if it fails, we'll recreate the conversation.
        let convId = entry.conversationId;
        
        // If it's a local conversation, create a real one in MongoDB first
        if (convId.startsWith('local-')) {
          const newConv = await apiService.createConversation(entry.conversationTitle);
          convId = newConv._id;
          
          // Record this mapping so any running generation promises know about it
          useChatStore.getState().recordIdMapping(entry.conversationId, convId);
          
          // Update the active conversation if the user is currently looking at this local chat
          const state = useChatStore.getState();
          if (state.activeConversation?._id === entry.conversationId) {
            state.setActiveConversation(newConv);
          }
        }

        // Push messages to MongoDB
        for (const msg of entry.messages) {
          await apiService.createMessage(convId, msg.role, msg.content);
        }

        // If this was the active conversation, refresh its messages so they don't disappear from the UI
        const state = useChatStore.getState();
        if (state.activeConversation?._id === convId) {
          const syncedMsgs = await apiService.fetchMessages(convId);
          state.setMessages([
            ...state.messages.filter((m) => m.conversationId !== entry.conversationId),
            ...syncedMsgs
          ]);
        }
        
        // Safely remove only this specific synced conversation from the queue
        await removeFromQueue(entry.conversationId);
      } catch (e) {
        console.error(`Failed to sync conversation ${entry.conversationId}:`, e);
      }
    }
    console.log('Offline queue synced successfully!');
    
    // Refresh the frontend state so local offline IDs are replaced with real MongoDB ObjectIds
    try {
      const convs = await apiService.fetchConversations();
      useChatStore.getState().setConversations(convs);
      // If active conversation was local, we should just let the user see the updated history
    } catch(e) {
      console.error('Failed to refresh conversations after sync:', e);
    }
  } finally {
    useChatStore.getState().setSyncing(false);
  }
};

export const initNetworkMonitoring = () => {
  // Check initial network status
  NetInfo.fetch().then((state) => {
    useChatStore.getState().setConnected(state.isConnected ?? false);
  });

  // Listen to network status changes
  return NetInfo.addEventListener((state) => {
    const isConnected = state.isConnected ?? false;
    const wasConnected = useChatStore.getState().isConnected;
    
    useChatStore.getState().setConnected(isConnected);

    // If we just regained connection, trigger sync
    if (isConnected && !wasConnected) {
      syncOfflineQueue();
    }
  });
};
