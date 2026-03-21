-- Enable realtime for orders table so clients can listen for status changes
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
