/**
 * Conversation History Storage - Supabase Implementation
 * Handles persistence and retrieval of Copilot chat history in Supabase
 */

import { createClient } from '@supabase/supabase-js';

// Create untyped client for AI tables (not in generated types yet)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(supabaseUrl, supabaseKey);

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    tokensUsed?: number;
    createdAt: string;
}

export interface Conversation {
    id: string;
    title: string | null;
    contextPage: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    messages?: ConversationMessage[];
}

// ============================================================================
// CONVERSATION STORAGE
// ============================================================================

export class ConversationStorage {
    /**
     * Create a new conversation
     */
    async createConversation(contextPage = 'dashboard'): Promise<Conversation> {
        const { data, error } = await supabase
            .from('ai_conversations')
            .insert({
                context_page: contextPage,
                message_count: 0,
            })
            .select()
            .single();

        if (error) {
            console.error('[ConversationStorage] Create error:', error);
            throw new Error(`Failed to create conversation: ${error.message}`);
        }

        return this.mapConversation(data);
    }

    /**
     * Get a conversation with its messages
     */
    async getConversation(id: string): Promise<Conversation | null> {
        const { data: conv, error: convError } = await supabase
            .from('ai_conversations')
            .select()
            .eq('id', id)
            .single();

        if (convError || !conv) {
            if (convError?.code !== 'PGRST116') { // Not found is OK
                console.error('[ConversationStorage] Get conversation error:', convError);
            }
            return null;
        }

        const { data: msgs, error: msgsError } = await supabase
            .from('ai_messages')
            .select()
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (msgsError) {
            console.error('[ConversationStorage] Get messages error:', msgsError);
        }

        return {
            ...this.mapConversation(conv),
            messages: (msgs || []).map(this.mapMessage),
        };
    }

    /**
     * Get recent conversations (for history list)
     */
    async getConversations(limit = 20): Promise<Conversation[]> {
        const { data, error } = await supabase
            .from('ai_conversations')
            .select()
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ConversationStorage] Get conversations error:', error);
            throw new Error(`Failed to get conversations: ${error.message}`);
        }

        return (data || []).map(this.mapConversation);
    }

    /**
     * Add a message to a conversation
     */
    async addMessage(
        conversationId: string,
        role: 'user' | 'assistant',
        content: string,
        tokensUsed?: number
    ): Promise<ConversationMessage> {
        const { data, error } = await supabase
            .from('ai_messages')
            .insert({
                conversation_id: conversationId,
                role,
                content,
                tokens_used: tokensUsed,
            })
            .select()
            .single();

        if (error) {
            console.error('[ConversationStorage] Add message error:', error);
            throw new Error(`Failed to add message: ${error.message}`);
        }

        // Update conversation metadata
        await supabase
            .from('ai_conversations')
            .update({
                updated_at: new Date().toISOString(),
                message_count: await this.getMessageCount(conversationId),
            })
            .eq('id', conversationId);

        // Auto-generate title from first user message
        if (role === 'user') {
            const conv = await this.getConversation(conversationId);
            if (conv && !conv.title && conv.messages && conv.messages.length <= 2) {
                const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
                await this.updateTitle(conversationId, title);
            }
        }

        return this.mapMessage(data);
    }

    /**
     * Get message count for a conversation
     */
    private async getMessageCount(conversationId: string): Promise<number> {
        const { count } = await supabase
            .from('ai_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conversationId);

        return count || 0;
    }

    /**
     * Update conversation title
     */
    async updateTitle(id: string, title: string): Promise<void> {
        const { error } = await supabase
            .from('ai_conversations')
            .update({ title })
            .eq('id', id);

        if (error) {
            console.error('[ConversationStorage] Update title error:', error);
        }
    }

    /**
     * Delete a conversation and all its messages
     */
    async deleteConversation(id: string): Promise<void> {
        // Messages will be cascade deleted by FK constraint
        const { error } = await supabase
            .from('ai_conversations')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[ConversationStorage] Delete error:', error);
            throw new Error(`Failed to delete conversation: ${error.message}`);
        }
    }

    /**
     * Check if the tables exist (for fallback to localStorage)
     */
    async tablesExist(): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('ai_conversations')
                .select('id')
                .limit(1);

            return !error;
        } catch {
            return false;
        }
    }

    // ============================================================================
    // MAPPERS
    // ============================================================================

    private mapConversation(row: Record<string, unknown>): Conversation {
        return {
            id: row.id as string,
            title: row.title as string | null,
            contextPage: (row.context_page as string) || 'dashboard',
            messageCount: (row.message_count as number) || 0,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
        };
    }

    private mapMessage(row: Record<string, unknown>): ConversationMessage {
        return {
            id: row.id as string,
            role: row.role as 'user' | 'assistant',
            content: row.content as string,
            tokensUsed: row.tokens_used as number | undefined,
            createdAt: row.created_at as string,
        };
    }
}

// Singleton instance
let storageInstance: ConversationStorage | null = null;

export function getConversationStorage(): ConversationStorage {
    if (!storageInstance) {
        storageInstance = new ConversationStorage();
    }
    return storageInstance;
}

export default getConversationStorage;
