using Xunit;

namespace Gx18Mcp.Tests
{
    public class SmokeTests
    {
        [Fact]
        public void Harness_Runs()
        {
            Assert.Equal(2, 1 + 1);
        }
    }
}
