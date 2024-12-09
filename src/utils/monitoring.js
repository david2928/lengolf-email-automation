const { Logging } = require('@google-cloud/logging');
const { Monitoring } = require('@google-cloud/monitoring');

class MonitoringService {
  constructor(projectId) {
    this.projectId = projectId;
    this.logging = new Logging({ projectId });
    this.monitoring = new Monitoring({ projectId });
  }

  async logProcessingMetrics(data) {
    const log = this.logging.log('email-processor-metrics');
    const metadata = {
      resource: {
        type: 'cloud_run_revision',
        labels: {
          service_name: 'email-processor',
          project_id: this.projectId
        }
      },
      severity: 'INFO'
    };

    const entry = log.entry(metadata, {
      ...data,
      timestamp: new Date().toISOString()
    });

    await log.write(entry);
  }

  async createCustomMetric(metricData) {
    const client = this.monitoring.metricServiceClient();
    const projectName = client.projectPath(this.projectId);

    const descriptor = {
      name: null,
      type: `custom.googleapis.com/${metricData.name}`,
      metricKind: 'GAUGE',
      valueType: 'INT64',
      unit: '1',
      description: metricData.description,
      displayName: metricData.displayName
    };

    const request = {
      name: projectName,
      metricDescriptor: descriptor
    };

    const [result] = await client.createMetricDescriptor(request);
    return result;
  }
}

module.exports = { MonitoringService };