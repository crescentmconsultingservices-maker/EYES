import { createAdminClient } from '@/utils/supabase/admin';

export interface CognitiveTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export type ToolExecutor = (args: any, userId: string) => Promise<string>;

const toolDefinitions: CognitiveTool[] = [
  {
    type: 'function',
    function: {
      name: 'trigger_sync',
      description: 'Triggers a background synchronization of user data (e.g., Slack, Gmail) into EYES. Use this when the user asks to refresh or sync their data.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_graph',
      description: 'Searches the EYES knowledge graph (chronic_nodes) for a specific entity or concept.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The entity or concept to search for in the graph.'
          }
        },
        required: ['query']
      }
    }
  }
];

const toolExecutors: Record<string, ToolExecutor> = {
  'trigger_sync': async (args, userId) => {
    try {
      const res = await fetch(`http://localhost:3000/api/cron/sync`, { method: 'GET' });
      if (res.ok) {
        return 'Data sync triggered successfully.';
      }
      return 'Failed to trigger sync.';
    } catch (e) {
      return 'Error triggering sync API.';
    }
  },
  'search_knowledge_graph': async (args, userId) => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('chronic_nodes')
      .select('name, label, summary, importance')
      .eq('user_id', userId)
      .ilike('name', `%${args.query}%`)
      .order('importance', { ascending: false })
      .limit(5);
    
    if (error) return `Error querying graph: ${error.message}`;
    if (!data || data.length === 0) return `No nodes found matching '${args.query}'.`;
    return `Found nodes: ${JSON.stringify(data)}`;
  }
};

export const ToolRegistry = {
  getTools(): CognitiveTool[] {
    return toolDefinitions;
  },

  async execute(name: string, args: any, userId: string): Promise<string> {
    const executor = toolExecutors[name];
    if (!executor) {
      return `Error: Tool ${name} not found.`;
    }
    try {
      console.log(`[Cognitive Tools] Executing ${name} with args:`, args);
      return await executor(args, userId);
    } catch (error: any) {
      console.error(`[Cognitive Tools] Error executing ${name}:`, error);
      return `Error executing tool: ${error?.message || 'Unknown error'}`;
    }
  }
};
