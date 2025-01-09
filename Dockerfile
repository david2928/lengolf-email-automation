# Use the official lightweight Node.js image
FROM node:18-slim

# Install dependencies required for node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

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