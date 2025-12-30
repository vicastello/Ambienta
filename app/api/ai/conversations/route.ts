import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { getConversationStorage, type Conversation } from '@/lib/ai/conversation-storage';

const storage = getConversationStorage();

/**
 * GET /api/ai/conversations - List conversations
 * GET /api/ai/conversations?id=xxx - Get specific conversation with messages
 */
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const id = searchParams.get('id');
        const limit = parseInt(searchParams.get('limit') || '20');

        if (id) {
            // Get specific conversation with messages
            const conversation = await storage.getConversation(id);

            if (!conversation) {
                return NextResponse.json(
                    { message: 'Conversa não encontrada' },
                    { status: 404 }
                );
            }

            return NextResponse.json({ data: conversation });
        }

        // List recent conversations
        const conversations = await storage.getConversations(limit);
        return NextResponse.json({ data: conversations, count: conversations.length });

    } catch (err) {
        console.error('[API] Error in GET /api/ai/conversations:', err);
        return NextResponse.json(
            { message: 'Erro ao buscar conversas', details: getErrorMessage(err) },
            { status: 500 }
        );
    }
}

/**
 * POST /api/ai/conversations - Create new conversation or add message
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);

        if (!body) {
            return NextResponse.json(
                { message: 'Body inválido' },
                { status: 400 }
            );
        }

        // Create new conversation
        if (body.action === 'create') {
            const conversation = await storage.createConversation(body.contextPage);
            return NextResponse.json({ data: conversation });
        }

        // Add message to conversation
        if (body.action === 'addMessage') {
            if (!body.conversationId || !body.role || !body.content) {
                return NextResponse.json(
                    { message: 'conversationId, role e content são obrigatórios' },
                    { status: 400 }
                );
            }

            const message = await storage.addMessage(
                body.conversationId,
                body.role,
                body.content,
                body.tokensUsed
            );

            return NextResponse.json({ data: message });
        }

        // Update title
        if (body.action === 'updateTitle') {
            if (!body.id || !body.title) {
                return NextResponse.json(
                    { message: 'id e title são obrigatórios' },
                    { status: 400 }
                );
            }

            await storage.updateTitle(body.id, body.title);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json(
            { message: 'Ação não reconhecida' },
            { status: 400 }
        );

    } catch (err) {
        console.error('[API] Error in POST /api/ai/conversations:', err);
        return NextResponse.json(
            { message: 'Erro ao processar requisição', details: getErrorMessage(err) },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/ai/conversations?id=xxx - Delete a conversation
 */
export async function DELETE(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { message: 'ID da conversa é obrigatório' },
                { status: 400 }
            );
        }

        await storage.deleteConversation(id);
        return NextResponse.json({ success: true });

    } catch (err) {
        console.error('[API] Error in DELETE /api/ai/conversations:', err);
        return NextResponse.json(
            { message: 'Erro ao deletar conversa', details: getErrorMessage(err) },
            { status: 500 }
        );
    }
}
