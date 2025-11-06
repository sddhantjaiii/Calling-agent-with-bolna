# Quick Guide: Register Bolna Agents

## Overview
Register your Bolna agents in 3 simple steps!

## Step 1: Create Agent in Bolna Dashboard

1. Go to [Bolna Dashboard](https://app.bolna.ai)
2. Click **"Create Agent"** or **"New Agent"**
3. Configure your agent:
   - Choose your voice (any provider)
   - Set up LLM (GPT, Claude, etc.)
   - Write your system prompt
   - Configure TTS and STT settings
4. **Save the agent**
5. **Copy the Agent ID** (looks like: `123e4567-e89b-12d3-a456-426614174000`)

## Step 2: Register in Your Admin Panel

1. Go to your admin panel: `http://localhost:3000/admin/agents/create`
2. Fill in the form:
   - **Bolna Agent ID**: Paste the ID you copied
   - **Agent Name**: Give it a friendly name (e.g., "Sales Assistant")
   - **Description**: (Optional) Describe what it does
   - **Assign to User**: (Optional) Select a user
3. Click **"Register Agent"**

## Step 3: Done!
✅ Your agent is now registered and ready to use!

## Form Fields Explained

### Bolna Agent ID (Required)
- This is the UUID from Bolna dashboard
- Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Where to find it: In the Bolna dashboard, each agent has an ID
- Example: `a1b2c3d4-5678-90ab-cdef-1234567890ab`

### Agent Name (Required)
- A friendly name for your dashboard
- Can be different from the Bolna agent name
- Examples: "Customer Support Bot", "Sales Qualifier", "Lead Scorer"

### Description (Optional)
- Describe what this agent does
- Helps your team understand its purpose
- Example: "Qualifies inbound leads and books meetings"

### Assign to User (Optional)
- Select which user this agent belongs to
- Leave as "No assignment" for shared/admin-managed agents
- Can be changed later via the "Assign" tab

## Validation

The form will check:
- ✅ Agent ID is a valid UUID format
- ✅ Agent ID exists in Bolna
- ✅ Agent name is not empty
- ✅ User (if selected) exists

## Common Issues

### "Invalid Agent ID format"
**Problem**: The ID you entered is not a valid UUID  
**Solution**: Make sure you copied the full ID from Bolna (36 characters with dashes)

### "Failed to verify Bolna agent"
**Problem**: Agent doesn't exist in Bolna or network error  
**Solution**: 
- Check if the agent exists in your Bolna dashboard
- Make sure you copied the correct ID
- Try refreshing and copying again

### "Agent name is required"
**Problem**: Name field is empty  
**Solution**: Enter a name for your agent

## Pro Tips

💡 **Use Descriptive Names**: Use names that describe the agent's purpose, not just "Agent 1"

💡 **Add Descriptions**: Future you will thank you for documenting what each agent does

💡 **Test in Bolna First**: Make sure your agent works in Bolna before registering it

💡 **Organize by User**: Assign agents to users for better organization

💡 **Check Status**: After registering, verify the agent appears in the agent list

## Where to Find Your Agents

After registration, find your agents in:
- **Agents Tab**: View all registered agents
- **Monitor Tab**: See agent performance
- **Health Tab**: Check agent health status

## Need Help?

If you encounter issues:
1. Check the browser console for errors (F12)
2. Check the backend logs
3. Verify your Bolna API key is configured
4. Contact support with the agent ID and error message

---

**Last Updated**: January 2025  
**Quick Start Time**: ~30 seconds per agent
