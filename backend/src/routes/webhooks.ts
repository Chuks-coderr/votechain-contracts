// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Router, Request, Response } from 'express';
import { validateWebhookUrl, WebhookRegistration } from '../services/webhookService';

const router = Router();

// In-memory storage for webhook registrations (replace with Redis/DB in production)
const webhookRegistrations: Map<string, WebhookRegistration[]> = new Map();

/**
 * POST /webhooks/register
 * Register a webhook for an address
 *
 * Body:
 * {
 *   "address": "G...",
 *   "webhook_url": "https://example.com/webhook"
 * }
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const { address, webhook_url } = req.body;

    // Validation
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing address' });
    }

    if (!webhook_url || typeof webhook_url !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing webhook_url' });
    }

    if (!validateWebhookUrl(webhook_url)) {
      return res.status(400).json({
        error: 'Webhook URL must be a valid HTTPS URL',
      });
    }

    // Register the webhook
    const registration: WebhookRegistration = {
      address,
      webhook_url,
      created_at: Date.now(),
    };

    if (!webhookRegistrations.has(address)) {
      webhookRegistrations.set(address, []);
    }

    const registrations = webhookRegistrations.get(address)!;

    // Avoid duplicate registrations
    const exists = registrations.some((r) => r.webhook_url === webhook_url);
    if (exists) {
      return res.status(409).json({
        error: 'Webhook URL already registered for this address',
      });
    }

    registrations.push(registration);

    return res.status(201).json({
      message: 'Webhook registered successfully',
      registration,
    });
  } catch (error) {
    console.error('[Webhooks] Error registering webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /webhooks/:address
 * Get all registered webhooks for an address
 */
router.get('/:address', (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const registrations = webhookRegistrations.get(address) || [];

    return res.json({
      address,
      webhooks: registrations,
      count: registrations.length,
    });
  } catch (error) {
    console.error('[Webhooks] Error fetching webhooks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /webhooks/:address/:webhookId
 * Unregister a webhook (identified by URL hash or index)
 */
router.delete('/:address/:webhookUrl', (req: Request, res: Response) => {
  try {
    const { address, webhookUrl } = req.params;
    const decodedUrl = decodeURIComponent(webhookUrl);

    const registrations = webhookRegistrations.get(address);
    if (!registrations) {
      return res.status(404).json({ error: 'No webhooks found for address' });
    }

    const initialLength = registrations.length;
    const filtered = registrations.filter((r) => r.webhook_url !== decodedUrl);

    if (filtered.length === initialLength) {
      return res.status(404).json({ error: 'Webhook URL not found' });
    }

    webhookRegistrations.set(address, filtered);

    return res.json({ message: 'Webhook unregistered successfully' });
  } catch (error) {
    console.error('[Webhooks] Error deleting webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
