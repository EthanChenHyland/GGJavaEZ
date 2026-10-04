import java.util.ArrayDeque;import java.util.LinkedList;import java.util.Queue;
public class Main {
 static void checkpoint(Object value){}
 static class Task {int code;Task(int code){this.code=code;}}
 public static void main(String[] args){Task first=new Task(3);Task second=new Task(4);Task urgent=new Task(2);ArrayDeque<Task> deque=new ArrayDeque<>();deque.addLast(first);deque.addLast(second);deque.addFirst(urgent);checkpoint(deque);Task popped=deque.removeFirst();checkpoint(deque);Queue<Task> queue=new LinkedList<>();queue.offer(first);queue.offer(second);checkpoint(queue);Task polled=queue.poll();checkpoint(queue);System.out.println(popped.code+":"+polled.code+":"+queue.peek().code);}
}
