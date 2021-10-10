'use strict';
const opentelemetry = require('@opentelemetry/api');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { BatchSpanProcessor } = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const provider = new NodeTracerProvider({
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'Weather-app'
    })
});
registerInstrumentations({
	tracerProvider: provider,
	instrumentations: [
	]
});

const options = {
	serviceName: 'Weather-app',
	endpoint: 'http://localhost:14268/api/traces'
}
const exporter = new JaegerExporter(options);
const spanProcessor = new BatchSpanProcessor(exporter);

provider.addSpanProcessor(spanProcessor);
provider.register();

module.exports = opentelemetry.trace.getTracer('Weather-app');