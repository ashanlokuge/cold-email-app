# Text-Only Email Campaign System

A simplified email campaign system that converts plain text to HTML automatically for better deliverability.

## Features

### Frontend (index.html)
- **Simple Interface**: Only requires subject and body text (no HTML knowledge needed)
- **Live Preview**: See how your email will look with personalization
- **Personalization**: Use `{{name}}` and `{{email}}` variables
- **File Upload**: Upload CSV/TXT files with recipient lists
- **Sender Management**: Create and manage sender addresses

### Backend (scripts/server.js)
- **Text-to-HTML Conversion**: Automatically converts plain text to professional HTML
- **Personalization**: Replaces `{{name}}` and `{{email}}` with actual values
- **Spintax Support**: Randomly selects from multiple options using `{option1|option2|option3}` syntax
- **Consistent Variations**: Same recipient always gets the same spintax choice (seeded random)
- **Deliverability**: Includes proper HTML structure, unsubscribe links, and headers
- **Rate Limiting**: Sends emails with proper delays to avoid spam filters
- **Sender Rotation**: Randomly selects from approved sender addresses

## How It Works

### 1. Text Input with Spintax
Users enter plain text with spintax variations:
```
Hi {{name}},

{Welcome|Thanks for joining|We're excited to have you} on board!

{Here's what you can do next|Next steps|What's next}:
- Complete your profile
- Explore our features  
- Get in touch if you need help

{Best regards|Thanks|Cheers},
{The Team|Support Team|Customer Success}
```

### 2. Spintax Expansion
The system randomly selects from spintax options:
```
Hi John Doe,

Thanks for joining on board!

Next steps:
- Complete your profile
- Explore our features  
- Get in touch if you need help

Thanks,
Support Team
```

### 3. Automatic HTML Conversion
The system converts this to professional HTML:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  Hi John Doe,<br><br>Thanks for joining on board!<br><br>Next steps:<br>- Complete your profile<br>- Explore our features<br>- Get in touch if you need help<br><br>Thanks,<br>Support Team
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p>If you no longer wish to receive these emails, you can <a href="mailto:unsubscribe@example.com?subject=Unsubscribe">unsubscribe here</a>.</p>
  </div>
</body>
</html>
```

### 4. Personalization
Variables are replaced with actual recipient data:
- `{{name}}` → Recipient's name
- `{{email}}` → Recipient's email
- `{{firstName}}` → First name only
- `{{lastName}}` → Last name only

## Usage

### 1. Start the Backend
```bash
cd scripts
node server.js
```

### 2. Open Frontend
Open `index.html` in your browser

### 3. Create Campaign
1. Enter email subject
2. Enter email body (plain text)
3. Upload recipient list (CSV/TXT format)
4. Click "Start Bulk Send"

### 4. Manage Senders
1. Go to "Manage Senders" tab
2. Add new sender addresses
3. Delete unwanted senders

## File Format

### Recipient List (CSV/TXT)
```
email@example.com,John Doe
jane@example.com,Jane Smith
bob@example.com,Bob Johnson
```

## Text Formatting

The system supports basic text formatting:
- **Bold text**: `**text**` → `<strong>text</strong>`
- *Italic text*: `*text*` → `<em>text</em>`
- `Code text`: `` `text` `` → `<code>text</code>`
- Line breaks: Automatically converted to `<br>` tags

## Spintax (Content Variations)

Spintax allows you to create multiple variations of your content that are randomly selected for each recipient:

### Basic Syntax
```
{option1|option2|option3}
```

### Examples
```
Hi {John|Jane|there},

{Welcome|Thanks for joining|We're excited to have you} on board!

{Here's what you can do next|Next steps|What's next}:
- Complete your profile
- Explore our features

{Best regards|Thanks|Cheers},
{The Team|Support Team|Customer Success}
```

### Advanced Spintax
- **Nested spintax**: `{Hello {John|Jane}|Hi there}`
- **Multiple options**: `{option1|option2|option3|option4}`
- **Mixed with personalization**: `Hi {{name}}, {welcome|thanks for joining}!`

### Consistency
- **Same recipient = Same choice**: Each recipient always gets the same spintax selection
- **Different recipients = Different choices**: Each recipient gets a different random selection
- **Seeded random**: Uses recipient email as seed for consistent results

### Benefits
1. **Avoids spam filters**: Different content for each recipient
2. **A/B testing**: Test which variations work best
3. **Personalization**: More natural, varied content
4. **Scalability**: Create thousands of unique variations

## Benefits

1. **No HTML Knowledge Required**: Users can write plain text
2. **Professional Output**: Automatically generates proper HTML structure
3. **Better Deliverability**: Includes unsubscribe links and proper headers
4. **Personalization**: Easy variable substitution
5. **Rate Limiting**: Prevents spam filter triggers
6. **Sender Management**: Easy sender address management

## Next Steps

This is the foundation for building a comprehensive email campaign system. Future enhancements could include:

1. **Templates**: Pre-built email templates
2. **Scheduling**: Send emails at specific times
3. **Analytics**: Track opens, clicks, and bounces
4. **A/B Testing**: Test different subject lines or content
5. **Segmentation**: Send different emails to different groups
6. **Automation**: Triggered email sequences


