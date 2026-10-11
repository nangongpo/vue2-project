import { Global, Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { EventOutboxService } from '#app/events/event-outbox.service.js'
import { EventStreamService } from '#app/events/event-stream.service.js'

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [EventStreamService, EventOutboxService],
  exports: [EventStreamService, EventOutboxService],
})
export class EventStreamModule {}
