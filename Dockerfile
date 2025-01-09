# Use the official lightweight Node.js image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080

# Expose port
EXPOSE 8080

# Start the application
CMD [ "node", "src/app.js" ]