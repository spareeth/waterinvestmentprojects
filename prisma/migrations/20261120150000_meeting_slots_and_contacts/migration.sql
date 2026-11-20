-- Upload link: the government organisation the uploader represents.
ALTER TABLE "Submission" ADD COLUMN "governmentOrganisation" TEXT NOT NULL DEFAULT '';

-- Meeting requests: the attendee's name and email as typed on the request.
ALTER TABLE "MeetingRequest" ADD COLUMN "contactName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT '';
