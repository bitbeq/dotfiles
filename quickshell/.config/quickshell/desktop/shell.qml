import Quickshell
import Quickshell.Services.Notifications

ShellRoot {
	NotificationServer {
		id: notificationServer

		// Handles incoming notifications from external applications
		onNotificationReceived: notification => {
			// Do Something
		}
	}
}
