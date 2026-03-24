import 'dotenv/config';
import { createMcp } from '../lib';

function handler(req: Request) {
    return createMcp()(req);
}

export { handler as GET };
export { handler as POST };
export { handler as DELETE };
