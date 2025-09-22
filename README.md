# Cold Mail Sender

A professional bulk email campaign management system built with Node.js and Azure Communication Services.

## Features

- 🚀 **Campaign Management**: Create and run email campaigns with real-time progress tracking
- 📧 **Bulk Email Sending**: Send personalized emails to multiple recipients
- 👤 **Sender Management**: Create and manage multiple sender addresses
- 📊 **Progress Tracking**: Real-time campaign monitoring with detailed sending statistics
- 🎯 **Personalization**: Support for spintax and variable replacement
- ⚡ **Rate Limiting**: Built-in email rate limiting for better deliverability
- 📱 **Responsive UI**: Clean, modern web interface

## Prerequisites

- Node.js 18+ 
- Azure Communication Services account
- Azure subscription with Email Communication Service configured

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd cold-mail-sender
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Azure credentials:
```env
COMMUNICATION_SERVICES_CONNECTION_STRING=your_connection_string_here
AZ_SUBSCRIPTION_ID=your_subscription_id
AZ_RESOURCE_GROUP=your_resource_group
AZ_EMAIL_SERVICE_NAME=your_email_service_name
AZ_EMAIL_DOMAIN=your_domain.com
RATE_PER_MINUTE=20
JITTER_PCT=50
MAX_RETRIES=3
```

## Usage

1. Start the backend server:
```bash
npm start
```

2. Open your browser and navigate to `http://localhost:3000`

3. **Manage Senders**: Add email sender addresses through the "Manage Senders" tab

4. **Create Campaign**: 
   - Fill in campaign name, subject, and email body
   - Upload a CSV/TXT file with recipient emails (format: `email,name`)
   - Preview your email before sending

5. **Monitor Progress**: Track your campaign progress in real-time through the "Campaign Progress" tab

## File Format

Upload recipient lists in CSV or TXT format:
```
email@example.com,John Doe
another@example.com,Jane Smith
```

## Email Personalization

Use these variables in your email content:
- `{{name}}` - Full name of recipient
- `{{firstName}}` - First name only
- `{{lastName}}` - Last name only
- `{{email}}` - Email address

### Spintax Support
Create variations in your content using spintax:
- `{Hello|Hi|Hey}` - Random selection
- `{option1*3|option2*1}` - Weighted selection
- `{#1-10}` - Random number range

## Project Structure

```
├── index.html              # Frontend web interface
├── package.json            # Node.js dependencies
├── scripts/
│   ├── server.js           # Main backend server
│   └── createAddress.js    # Azure sender address creation
├── .env                    # Environment variables (create this)
└── README.md              # This file
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `COMMUNICATION_SERVICES_CONNECTION_STRING` | Azure Communication Services connection string | Yes |
| `AZ_SUBSCRIPTION_ID` | Azure subscription ID | Yes |
| `AZ_RESOURCE_GROUP` | Azure resource group name | Yes |
| `AZ_EMAIL_SERVICE_NAME` | Azure Email Communication Service name | Yes |
| `AZ_EMAIL_DOMAIN` | Your verified email domain | Yes |
| `RATE_PER_MINUTE` | Emails per minute (default: 20) | No |
| `JITTER_PCT` | Rate jitter percentage (default: 50) | No |
| `MAX_RETRIES` | Max retry attempts (default: 3) | No |

## API Endpoints

- `GET /test` - Server health check
- `GET /senders` - List approved sender addresses
- `POST /senders` - Create new sender address
- `DELETE /senders` - Remove sender address
- `POST /bulk-send` - Start bulk email campaign
- `GET /campaign-status` - Get current campaign status
- `GET /email-details` - Get detailed sending information

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.