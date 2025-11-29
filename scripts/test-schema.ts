
import { documentStatusResponseSchema } from '../lib/schemas/documentStatus';

const validPayload = {
    documents: [
        {
            id: 'b4247ac4-80a4-4b0b-99e3-971eca1a4fcd',
            name: 'Valid Doc',
            uploaded_at: '2025-11-29T20:38:16.367+00:00',
            task_count: 4,
            status: 'pending',
            included_at: null
        }
    ],
    summary: {
        included_count: 0,
        excluded_count: 0,
        pending_count: 1,
        total_task_count: 4
    },
    total: 1
};

const invalidTimestampPayload = {
    ...validPayload,
    documents: [
        {
            ...validPayload.documents[0],
            uploaded_at: '2025-11-29T20:38:16.367' // Missing offset
        }
    ]
};

console.log('Testing valid payload...');
const validResult = documentStatusResponseSchema.safeParse(validPayload);
if (validResult.success) {
    console.log('Valid payload passed.');
} else {
    console.error('Valid payload failed:', validResult.error.flatten());
}

console.log('Testing invalid timestamp payload...');
const invalidResult = documentStatusResponseSchema.safeParse(invalidTimestampPayload);
if (invalidResult.success) {
    console.log('Invalid payload passed (unexpected).');
} else {
    console.log('Invalid payload failed as expected:', JSON.stringify(invalidResult.error.flatten(), null, 2));
}
